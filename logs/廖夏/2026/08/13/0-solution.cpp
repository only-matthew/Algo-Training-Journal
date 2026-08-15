//下面是调试了二十分钟的代码
#include<iostream>
#include<string>
#include<cmath>
using namespace std;
string s;

void work(long long n){
    // 单字符时无限串永远是同一个字符，避免后面折半到 l=1 时 pos 变成 0 越界
    if (s.length() == 1){ cout << s[0]; return; }
    long long k;
    if (n > s.length())
        k = ceil(log((1.0 * n) / s.length()) / 0.6931471805599453);
    else k = n;
    long long l = s.length() * (1LL << k);
    long long pos = n;
    // cout << "Beginning l : " << l << "\t pos : " << pos << endl;
    while (l > s.length()){
        l /= 2;
        if (pos == l*2) pos = l - 1;
        else if (pos > l + 1) pos %= l, pos--; //continue;
        else if (pos == l + 1) pos = l;
        // cout << "l : " << l << "\t pos : " << pos << endl;
    }
    cout <<s[pos-1];
}

int main(){
    cin >> s;
    long long n; cin >> n; work(n);
    return 0;
}

//下面是标程，优雅而简介

#include<iostream>
#include<string>
using namespace std;
string s;

void work(long long n){
    long long len = s.length();
    // 方向反过来：从 len 开始翻倍，直到 >= n（全程 long long，无浮点无移位坑）
    long long l = len;
    while (l < n) l *= 2;

    long long pos = n;
    // 折半映射，规则统一成一条：pos 落在第二半时，换算回第一半
    while (l > len){
        l /= 2;
        if (pos > l){
            pos -= l + 1;            // 第二半第 j 个字符 → 第一半第 j-1 个字符
            if (pos == 0) pos = l;   // 第二半第 1 个字符 = 第一半最后一个字符
        }
    }
    cout << s[pos - 1];
}

int main(){
    cin >> s;
    long long n; cin >> n;
    work(n);
    return 0;
}