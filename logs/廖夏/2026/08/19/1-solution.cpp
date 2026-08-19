#include<iostream>
#include<algorithm>
#include<cstring>
using namespace std;
const int MAXN = 1e3 + 5;
struct Per{
    int num; long long time;
    bool operator<(Per other){
        if (time != other.time) return time < other.time;
        return num > other.time;
    }
};
Per a[MAXN];
int main(){
    int n;
    cin >> n;
    for (int i = 1; i <= n; i++) {cin >> a[i].time; a[i].num = i;}
    sort(a + 1, a + 1 + n);
    for (int i = 1; i <= n; i++) cout << a[i].num << " ";
    cout << "\n";
    long long res = 0;
    for (int i = 1; i < n; i++) res += a[i].time * (n - i) * 1LL;
    printf("%0.2lf", 1.0 * res / n);
    return 0;
}