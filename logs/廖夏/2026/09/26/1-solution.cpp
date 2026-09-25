#include<iostream>
#include<algorithm>
#include<cstring>
using namespace std;
const int MAXA = 100 + 5;
int a[MAXA];
int print(){
    int cnt = 0;
    int index = 105;
    while(!a[--index]);
    int limit = a[index];
    for (int i = 1; i <= limit; i++) cout << index << " ";
    cnt += limit; a[index] = 0;

    for (int i = index-1; i >= 1; i--){
        if (!a[i]) continue;
        int num;
        if (a[i] > limit)
            num = limit;
        else num = a[i];
        a[i] -= num;
        for (int j = 1; j <= num; j++) cout << i << " ";
        cnt += num;
    }
    return cnt;
}
int main(){
    int t; cin >> t;
    while(t--){
        int n; cin >> n;
        memset(a, 0, sizeof(a));
        for (int i = 1; i <= n; i++) {int x; cin >> x; a[x]++;}
        int cnt = 0;
        while(cnt < n){
            cnt += print();
        }
        cout << endl;
    }
    return 0;
}