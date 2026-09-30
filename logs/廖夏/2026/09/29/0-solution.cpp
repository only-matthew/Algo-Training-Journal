#include<iostream>
#include<algorithm>
using namespace std;
int main(){
    int t; cin >> t;
    while(t--){
        int h, m;
        cin >> h >> m;
        while (m > 60) {
            m -= 60;
            h++;
        }
        while (h > 24) h -= 24;
        cout << h << ' ' << m << endl;
    }
    return 0;
}