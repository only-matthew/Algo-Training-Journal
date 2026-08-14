#include<iostream>
using namespace std;
int main()
{
    int t;
    cin>>t;
    while(t--)
    {
        int x;
        cin>>x;
        int temp=x;
        int y=1;
        while(temp)
        {
            y*=10;
            temp/=10;
        }
        y+=1;
        cout<<y<<endl;
    }
    return 0;
}